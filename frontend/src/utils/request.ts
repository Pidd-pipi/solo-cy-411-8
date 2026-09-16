import axios from 'axios';
import { message } from 'antd';
import { useAuthStore } from '../stores/authStore';

export const request = axios.create({
  baseURL: '/api',
  timeout: 12000
});

request.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error.response?.data?.message || error.message || '请求失败';
    message.error(msg);
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

