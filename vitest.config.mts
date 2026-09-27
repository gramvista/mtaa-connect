import { defineConfig } from 'vitest/config';
export default defineConfig({test:{pool:'threads',maxWorkers:1,fileParallelism:false,testTimeout:20000,hookTimeout:60000}});
