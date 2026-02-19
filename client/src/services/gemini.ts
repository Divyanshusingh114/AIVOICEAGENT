import { GoogleGenAI, Type } from "@google/genai";

export class GeminiService {
  async analyzeCampaignPerformance(campaignName: string, stats: any) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this VoIP campaign performance for "${campaignName}": ${JSON.stringify(stats)}.
                   Provide a short executive summary, conversion rate, and 3 actionable suggestions to improve call completion.`,
      });
      return response.text;
    } catch (error) {
      console.error('Gemini Analysis Error:', error);
      return "Failed to generate AI analysis.";
    }
  }

  async summarizeCallTranscripts(transcript: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Summarize this call transcript between a voice agent and a customer. Identify customer intent and sentiment.
                   Transcript: ${transcript}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              sentiment: { type: Type.STRING },
              intent: { type: Type.STRING },
              nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["summary", "sentiment", "intent", "nextSteps"]
          }
        }
      });
      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error('Gemini Transcription Summary Error:', error);
      return null;
    }
  }
}

export const geminiService = new GeminiService();
