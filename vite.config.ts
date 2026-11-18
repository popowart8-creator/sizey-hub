import {defineConfig} from 'vite';
export default defineConfig({server:{proxy:{'/hub-api':'http://127.0.0.1:8089'}},build:{rollupOptions:{input:{app:'index.html',admin:'admin/index.html'}}}});
