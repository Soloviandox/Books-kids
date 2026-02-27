
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CharacterAssignment, GenerationConfig } from "../types";

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodePCM(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const numChannels = 1;
  const sampleRate = 24000;
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function pcmToWavBlob(pcmData: Uint8Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); 
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  writeString(36, 'data');
  view.setUint32(40, pcmData.length, true);
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);
  return new Blob([buffer], { type: 'audio/wav' });
}

export class FairyTaleService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generatePlotPoints(): Promise<string[]> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Придумай 4 очень коротких (2-4 слова) сюжетных события для детской сказки. ВАЖНО: НЕ упоминай никаких персонажей (людей, животных или существ). Используй только события или объекты (например: 'Поиск лунного камня', 'Таинственный туман'). Ответ должен быть только в формате JSON массива строк на русском языке.",
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    try {
      return JSON.parse(response.text || '[]');
    } catch (e) {
      console.error("Error generating plot points", e);
      return [];
    }
  }

  async generateStory(config: GenerationConfig): Promise<string> {
    const prompt = `Напиши добрую детскую сказку. 
    ЛОКАЦИЯ: ${config.location || 'Волшебная страна'}.
    ПЕРСОНАЖИ: ${config.characters.join(', ')}.
    КЛЮЧЕВЫЕ МОМЕНТЫ СЮЖЕТА: ${config.plotPoints.join('; ')}.
    ПРИМЕРНАЯ ДЛИНА: ${config.length} (ориентируйся на этот хронометраж при чтении вслух).
    ФОРМАТ: Текст должен содержать описательные части и четкие реплики персонажей в формате "Имя: Текст реплики". 
    Стиль должен быть сказочным, уютным и интересным для детей. Обязательно опиши атмосферу локации.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });

    return response.text || "Не удалось сгенерировать сказку.";
  }

  async extractCharacters(storyText: string): Promise<string[]> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Проанализируй сказку и составь список ВСЕХ уникальных персонажей (включая Рассказчика, если он важен), у которых есть реплики. 
      Выведи ТОЛЬКО массив строк в формате JSON на русском языке.
      Текст: ${storyText}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    try {
      return JSON.parse(response.text || '[]');
    } catch (e) {
      return [];
    }
  }

  async previewVoice(voiceId: string): Promise<string> {
    const previewSentence = "Однажды вечером Заяц и Ёжик заигрались и ушли далеко от дома.";
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Прочитай это предложение спокойно: ${previewSentence}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!base64Audio) throw new Error("Ошибка предпрослушивания");
    return base64Audio;
  }

  async generateAudio(storyText: string, assignments: CharacterAssignment[], speedOffset: number = 0): Promise<string> {
    const uniqueRequestedVoices = Array.from(new Set(assignments.map(a => a.voiceId)));
    const voice1Id = uniqueRequestedVoices[0] || 'Zephyr';
    const voice2Id = uniqueRequestedVoices[1] || 'Charon';
    const speaker1Name = "VoiceA";
    const speaker2Name = "VoiceB";
    const mapping = assignments.map(a => `- ${a.character} говорит голосом ${a.voiceId === voice1Id ? speaker1Name : speaker2Name}`).join('\n');
    let speedInstr = speedOffset !== 0 ? `на ${Math.abs(speedOffset)}% ${speedOffset < 0 ? 'медленнее' : 'быстрее'} обычного` : 'стандартной скоростью';

    const prompt = `Ты — рассказчик сказок. Читай текст ${speedInstr}. 
    Паузы между репликами персонажей на 15% длиннее.
    РОЛИ:
    ${mapping}
    ТЕКСТ: ${storyText}`;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: speaker1Name, voiceConfig: { prebuiltVoiceConfig: { voiceName: voice1Id } } },
              { speaker: speaker2Name, voiceConfig: { prebuiltVoiceConfig: { voiceName: voice2Id } } }
            ]
          }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Не удалось сгенерировать аудио");
    return base64Audio;
  }
}
