
// Fix: Use gemini-3-pro-preview for complex reasoning tasks like synthetic data generation with relational integrity
import { GoogleGenAI, Type } from "@google/genai";

export const generateSyntheticDataBatch = async (
  prompt: string,
  count: number,
  exampleValues: string[] = [],
  contextValues: string[] = [] 
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini");
    return Array(count).fill("API_KEY_MISSING");
  }

  const model = 'gemini-3-pro-preview';
  
  const examplesText = exampleValues.length > 0 
    ? `Here are some examples of the desired data format/style: ${exampleValues.slice(0, 5).join(', ')}.` 
    : '';

  const contextText = contextValues.length > 0
    ? `IMPORTANT: This field depends on other fields in the same row. You will be provided with ${contextValues.length} context row strings. You MUST generate exactly one corresponding value for each context string in the exact same order. Use the values in each context string (e.g., "[First Name: John, Last Name: Doe]") to inform your generation for that specific row. Context values list: [${contextValues.join(' | ')}].`
    : '';

  const systemInstruction = `
    STRICT CONSTRAINTS:
    1. ID PATTERNS: Analyze patterns in provided samples. Identify the exact alphanumeric pattern. Generate new, unique IDs that follow this EXACT format.
    2. RELATIONAL INTEGRITY: Only use provided context values for dependent fields.
    3. DATA TYPES (3DEXPERIENCE standard):
       - 'Integer': Generate whole numbers only (no decimal points).
       - 'Real': Generate floating point numbers.
       - 'Date': Generate ISO-8601 timestamps.
       - 'Boolean': 'true' or 'false' (or 1/0 as appropriate for samples).
       - 'String' / 'Text Area': Professional corporate language.
       - 'Revision': Follow standard revision patterns (A.1, B.2, etc.) if samples suggest it.
    4. CREATIVE FIELDS: When the strategy is "AI Creative", generate professional-grade, realistic values. If context values are provided, ensure your generated output for that row is logically derived from those values.
    5. NO HALLUCINATION: If a column is defined as "Dropdown," do not introduce new values outside of the user-defined selection list if provided.

    You are a synthetic data generator. 
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
