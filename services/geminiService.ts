import { GoogleGenAI, Type } from "@google/genai";

export const generateSyntheticDataBatch = async (
  prompt: string,
  count: number,
  exampleValues: string[] = [],
  contextValues: string[] = []
): Promise<string[]> => {
  
  // Look for the key in process.env (Node) OR the global window object (Browser)
  const API_KEY = (typeof process !== 'undefined' && process.env?.API_KEY) 
                  || (window as any).GEMINI_API_KEY 
                  || "";

  const ai = new GoogleGenAI(API_KEY);

  if (!API_KEY) {
    console.warn("No API Key found for Gemini. Check index.html window.GEMINI_API_KEY");
    return Array(count).fill("API_KEY_MISSING");
  }

  const model = 'gemini-3-pro-preview';

  const examplesText = exampleValues.length > 0
    ? `Here are some examples of the desired data format/style: ${exampleValues.slice(0, 5).join(', ')}.`
    : '';

  const contextText = contextValues.length > 0
    ? `IMPORTANT: This field depends on other fields. Context: [${contextValues.join(' | ')}].`
    : '';

  const systemInstruction = `
    STRICT CONSTRAINTS:
    1. ID PATTERNS: Follow sample patterns exactly.
    2. RELATIONAL INTEGRITY: Use provided context values.
    3. DATA TYPES: Integer, Real, Date (ISO-8601), Boolean, String.
    4. NO HALLUCINATION: Only use user-defined lists for dropdowns.

    Return ONLY a JSON array of strings.
  `;

  try {
    const response = await ai.getGenerativeModel({ model }).generateContent({
      contents: [{ role: 'user', parts: [{ text: `Generate ${count} values for: "${prompt}". ${systemInstruction} ${examplesText} ${contextText}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return Array(count).fill("Error: Generation Failed");
  }
};
