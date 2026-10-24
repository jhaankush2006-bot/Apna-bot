
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));



const path = require("path");
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    aiConfigured: Boolean(ai)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is missing in your .env file."
      });
    }

    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Please enter a question."
      });
    }

    // Keep only valid, recent messages.
    const history = messages
      .filter(
        (m) =>
          m &&
          ["user", "model"].includes(m.role) &&
          typeof m.text === "string" &&
          m.text.trim().length > 0
      )
      .slice(-16)
      .map((m) => ({
        role: m.role,
        parts: [
          { text: m.text.slice(0, 6000) }
        ]
      }));

    if (!history.length || history.at(-1).role !== "user") {
      return res.status(400).json({
        error: "The latest message must be a user question."
      });
    }



    const start = Date.now();
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: history,
      config: {
        systemInstruction:
          "You are Nova, a helpful general-purpose AI assistant. " +
          "Answer questions clearly and accurately. " +
          "Use headings, examples, and code when useful. " +
          "If you are uncertain, say so. Do not claim to have " +
          "searched the live internet unless a search tool was used."
      }
    });
    console.log(
  `Gemini generation time: ${(Date.now() - start) / 1000}s`
);


    const answer = result.text;

    if (!answer) {
      return res.status(502).json({
        error: "Gemini returned an empty answer. Please try again."
      });
    }

    res.json({ answer });

  } catch (error) {
    console.error("Gemini API error:", error.message);

    res.status(500).json({
      error:
        "Could not generate an answer. Check your API key, " +
        "model availability, network connection and API quota."
    });
  }
});

console.log("Server file loaded");
console.log("PORT =", process.env.PORT);

app.listen(PORT, () => {
  console.log(`Nova is running at http://localhost:${PORT}`);
});