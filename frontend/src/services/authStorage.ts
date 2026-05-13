/**
 * Tokens solo en sessionStorage: al cerrar el navegador (todas las ventanas) la sesión no persiste.
 * localStorage mantenía el login indefinidamente; se limpian claves heredadas al usar clear().
 */
const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refresh_token';

export const authStorage = {
  getToken: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  getRefreshToken: (): string | null => {
    try {
      return sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setTokens(access: string, refresh: string): void {
    try {
      sessionStorage.setItem(TOKEN_KEY, access);
      sessionStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* ignore quota / private mode */
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};
