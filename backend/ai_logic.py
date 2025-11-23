import os
from groq import Groq

class AILogic:
    def __init__(self, api_key=None):
        self.client = Groq(api_key=api_key or os.environ.get("GROQ_API_KEY"))

    def explain_match(self, record_l, record_r, match_probability):
        """
        Explain why two records matched using Llama 3 via Groq.
        """
        prompt = f"""
        You are an expert data analyst. Explain why these two records are considered a match with probability {match_probability:.2f}.
        
        Record A: {record_l}
        Record B: {record_r}
        
        Highlight the similarities and differences. Be concise.
        """
        
        try:
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                model="llama3-8b-8192",
            )
            return chat_completion.choices[0].message.content
        except Exception as e:
            return f"Error generating explanation: {str(e)}"

# Example usage
if __name__ == "__main__":
    ai = AILogic(api_key="dummy_key") # Will fail without real key
    # print(ai.explain_match({"name": "JMAN"}, {"name": "JMAN Group"}, 0.9))
