import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import RetryDemo from './RetryDemo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Available in every markdown page as <RetryDemo …/>.
    app.component('RetryDemo', RetryDemo);
  },
} satisfies Theme;
