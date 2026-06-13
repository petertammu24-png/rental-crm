import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const TOKEN_KEY = "jcrm_token";

export const apiClient = axios.create({
  baseURL: API,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== "/login") {
        localStorage.removeItem(TOKEN_KEY);
        window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  },
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
