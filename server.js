import express from "express";

const app = express();

app.get("/", (req, res) => res.send("Bot is running 24/7"));

app.listen(3000, () => {
  console.log("🌐 Server listening on port 3000");
});
