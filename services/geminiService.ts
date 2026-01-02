
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSyntheticDataBatch = async (
  prompt: string,
  count: number,
  exampleValues: string[] = [],
  contextValues: string[] = [] 
): Promise<string[]> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini");
    return Array(count).fill("API_KEY_MISSING");
  }

  const model = 'gemini-3-flash-preview';
  
  const examplesText = exampleValues.length > 0 
    ? `Here are some examples of the desired data format/style: ${exampleValues.slice(0, 5).join(', ')}.` 
    : '';

  const contextText = contextValues.length > 0
    ? `IMPORTANT: This field depends on other fields in the same row. You will be provided with ${contextValues.length} context row strings. You MUST generate exactly one corresponding value for each context string in the exact same order. Use the values in each context string (e.g., "[First Name: John, Last Name: Doe]") to inform your generation for that specific row. Context values list: [${contextValues.join(' | ')}].`
    : '';

  const systemInstruction = `
    STRICT CONSTRAINTS:
    1. ID PATTERNS: Analyze the 'id' and 'physicalid' columns in the provided samples. Identify the exact alphanumeric pattern. Generate new, unique IDs that follow this EXACT format.
    2. RELATIONAL INTEGRITY: Only use provided context values for dependent fields.
    3. DATA TYPES:
       - 'originated' / 'modified': Generate ISO-8601 timestamps.
       - 'owner' / 'name': Create realistic corporate usernames (e.g., jsmith, ddoe).
    4. CREATIVE FIELDS: When the strategy is "AI Creative", generate professional-grade, realistic values. If context values are provided in the format "[Field: Value, ...]", ensure your generated output for that row is logically and semantically derived from those values (e.g., if context is John Doe, an email should be john.doe@company.com).
    5. NO HALLUCINATION: If a column is defined as "Random (Dropdown)," do not introduce new values outside of the user-defined selection list.

    You are a synthetic data generator. 
    Your task is to generate realistic, diverse, professional-grade, and contextually appropriate data based on a user's column description and provided context.
    Return ONLY a JSON array of strings. Do not include markdown formatting or explanations.
    ${examplesText}
    ${contextText}
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

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        if (parsed.length < count) {
          const result = [];
          for (let i = 0; i < count; i++) {
            result.push(parsed[i % parsed.length]);
          }
          return result;
        }
        return parsed.slice(0, count);
      }
    } catch (parseError) {
       console.error("JSON Parse Error on Gemini Response:", text);
       return Array(count).fill("Error: Invalid JSON");
    }
    
    return Array(count).fill("Error: Invalid Format");

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return Array(count).fill("Error: Generation Failed");
  }
};
