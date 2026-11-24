import axios from "axios";

const rawBackendUrl =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:3000"
    : "https://samvad-live-backend.onrender.com");

const backendUrl = rawBackendUrl.replace(/\/$/, "");

export const axiosInstance = axios.create({
  baseURL: `${backendUrl}/api`,
  withCredentials: true,
});
