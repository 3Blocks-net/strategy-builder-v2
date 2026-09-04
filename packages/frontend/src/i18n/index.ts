/**
 * The app's single entry into i18n. Importing it boots the i18next instance
 * (see `./instance`), so `main.tsx` and the test setup import it for the side
 * effect alone.
 */
export * from './languages';
export * from './instance';
export { createFormatters, useFormatters, type Formatters } from './formatting';
