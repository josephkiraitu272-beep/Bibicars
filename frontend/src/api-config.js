// Leaf module: NO imports from application code, to avoid circular-import TDZ.
// It exports the shared API_URL, the AuthContext and the useAuth() hook that
// used to live in App.js. All page components now import from here instead of
// `../App`, breaking the App.js <-> pages/* dependency cycle that caused the
// runtime error "Cannot access 'API_URL' before initialization" once we had to
// disable the `devtool: 'eval'` webpack option (blocked by the preview CSP).
//
// App.js also imports from this file and provides the AuthContext.Provider,
// so consumers still get the live auth state via useAuth().
import { createContext, useContext } from 'react';

export const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);
