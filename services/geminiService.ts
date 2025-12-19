import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSyntheticDataBatch = async (
  prompt: string,
  count: number,
  exampleValues: string[] = []
): Promise<string[]> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini");
    return Array(count).fill("API_KEY_MISSING");
  }

  const model = 'gemini-3-flash-preview';
  
  const examplesText = exampleValues.length > 0 
    ? `Here are some examples of the desired data format/style: ${exampleValues.slice(0, 5).join(', ')}.` 
    : '';

  const systemInstruction = `
    STRICT CONSTRAINTS:
    1. ID PATTERNS: Analyze 'id' and 'physicalid' columns in provided samples. Identify exact alphanumeric patterns (e.g., "ABC.12345-001"). Generate new, unique IDs following this EXACT format.
    2. RELATIONAL INTEGRITY: If generating Foreign Keys, ensure they match the format of the Parent IDs.
    3. DATA TYPES: 
       - Dates: Generate ISO-8601 timestamps. Ensure logical flow (modified >= originated).
       - Owners/Names: Use realistic corporate usernames or names consistent with reference styles.
    4. CREATIVE FIELDS: When strategy is "Be Creative", generate professional-grade descriptions (e.g. for aerospace: "stress analysis", "composite layup", "tolerance deviation"). Avoid generic "lorem ipsum".
    5. NO HALLUCINATION: If a column is defined as "Random (Dropdown)", do NOT introduce new values outside user-defined lists or provided samples.

    You are a synthetic data generator. 
    Your task is to generate realistic, diverse, professional-grade, and contextually appropriate data based on a user's column description.
    Return ONLY a JSON array of strings. Do not include markdown formatting or explanations.
    ${examplesText}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Generate ${count} unique values for a dataset column described as: "${prompt}".`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    if (!text) return Array(count).fill("Error: No Response");

    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      // If we didn't get enough, just cycle them
      if (parsed.length < count) {
        const result = [];
        for (let i = 0; i < count; i++) {
          result.push(parsed[i % parsed.length]);
        }
        return result;
      }
      return parsed.slice(0, count);
    }
    return Array(count).fill("Error: Invalid Format");

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return Array(count).fill("Error: Generation Failed");
  }
};