import { loadTheme } from '../shared/theme/registry';

const theme = loadTheme(process.env.THEME);
export { theme };
