import express from "express";
import { Log } from "./logging_middleware/logger.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 8080;

const BASE_URL = "http://20.207.122.201/evaluation-service";
const TOKEN = process.env.BEARER_TOKEN;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
};

app.get("/", async (req, res) => {
  try {
    await Log("backend", "info", "route", "Scheduler API started");

    const depotsRes = await axios.get(`${BASE_URL}/depots`, { headers });

    const vehiclesRes = await axios.get(`${BASE_URL}/vehicles`, { headers });

    const depots = depotsRes.data.depots;
    const vehicles = vehiclesRes.data.vehicles;

    const maxHours = depots[0].MechanicHours;

    vehicles.sort((a, b) => b.Impact - a.Impact);

    let totalTime = 0;
    let totalImpact = 0;
    let selected = [];

    for (let v of vehicles) {
      if (totalTime + v.Duration <= maxHours) {
        selected.push(v);
        totalTime += v.Duration;
        totalImpact += v.Impact;
      }
    }

    await Log("backend", "info", "service", "Tasks selected successfully");

    res.json({
      selectedTasks: selected,
      totalTime: totalTime,
      totalImpact: totalImpact,
    });
  } catch (err) {
    console.log(err.message);
    await Log("backend", "error", "handler", "Error in scheduler");
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
