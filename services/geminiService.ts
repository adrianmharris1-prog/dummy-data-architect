
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSyntheticDataBatch = async (
  prompt: string,
  count: number,
  exampleValues: string[] = [],
  contextValues: string[] = [] // New: Values to base the generation on
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
    ? `IMPORTANT: This field depends on another field. You will be provided with ${contextValues.length} context values. You MUST generate exactly one corresponding value for each context item in the exact same order. Context values: [${contextValues.join(', ')}].`
    : '';

  const systemInstruction = `
    STRICT CONSTRAINTS:
    1. ID PATTERNS: Analyze the 'id' and 'physicalid' columns in the provided samples. Identify the exact alphanumeric pattern (e.g., "ABC.12345-001" or "UUID-style"). Generate new, unique IDs that follow this EXACT format.
    2. RELATIONAL INTEGRITY: If Table A (Parent) and Table B (Child) are linked by an ID:
       - First, generate the specified number of rows for Table A.
       - Second, use only the IDs generated in Table A to populate the Foreign Key column in Table B.
    3. DATA TYPES:
       - 'originated' / 'modified': Generate ISO-8601 timestamps. Ensure 'modified' is always >= 'originated'.
       - 'owner' / 'name': Use the list of names provided in the 'Person' file or create realistic corporate usernames (e.g., jsmith, ddoe).
    4. CREATIVE FIELDS: When the strategy is "AI Creative", generate professional-grade, realistic descriptions or values. Avoid generic "lorem ipsum." If context values are provided, ensure your generated output is semantically related to each context value row-by-row.
    5. NO HALLUCINATION: If a column is defined as "Random (Dropdown)," do not introduce new values outside of the user-defined selection list.

    You are a synthetic data generator. 
    Your task is to generate realistic, diverse, professional-grade, and contextually appropriate data based on a user's column description.
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
