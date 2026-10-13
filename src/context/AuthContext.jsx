import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  initFirebase,
  getStoredFirebaseConfig,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithGoogle,
  checkRedirectResult,
  signOut as fbSignOut,
  formatAuthError,
} from '../services/firebase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState({
    uid: 'operator_demo_01',
    email: 'operator@anveshak.iot',
    displayName: 'Safety Operator',
    photoURL: null,
    isDemoUser: true,
    isGoogleUser: false,
    isFirebaseUser: false,
  });
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [firebaseActive, setFirebaseActive] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const config = getStoredFirebaseConfig();
    if (config.apiKey && config.projectId) {
      const fb = initFirebase(config);
      if (fb.success && fb.auth) {
        setFirebaseActive(true);

        // Check if returning from a Google OAuth redirect sign-in
        checkRedirectResult()
          .then((redirectRes) => {
            if (redirectRes?.user) {
              const fbUser = redirectRes.user;
              const isGoogle = fbUser.providerData?.some((p) => p.providerId === 'google.com') || false;
              setUser({
                uid: fbUser.uid,
                email: fbUser.email || '',
                displayName: fbUser.displayName || 'Google Operator',
                photoURL: fbUser.photoURL || null,
                isDemoUser: false,
                isGoogleUser: isGoogle,
                isFirebaseUser: true,
              });
              setFirebaseUser(fbUser);
            }
          })
          .catch((err) => {
            console.warn('Redirect sign-in error:', err);
            setAuthError(formatAuthError(err));
          });

        const unsubscribe = onAuthStateChanged(
          fb.auth,
          (fbUser) => {
            if (fbUser) {
              const isGoogle = fbUser.providerData?.some((p) => p.providerId === 'google.com') || false;
              setUser({
                uid: fbUser.uid,
                email: fbUser.email || '',
                displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Firebase Operator',
                photoURL: fbUser.photoURL || null,
                isDemoUser: false,
                isGoogleUser: isGoogle,
                isFirebaseUser: true,
              });
              setFirebaseUser(fbUser);
            } else {
              // User signed out or expired session
              setUser({
                uid: 'guest_observer',
                email: 'guest@anveshak.iot',
                displayName: 'Guest Observer',
                photoURL: null,
                isDemoUser: true,
                isGoogleUser: false,
                isFirebaseUser: false,
              });
              setFirebaseUser(null);
            }
            setAuthReady(true);
          },
          (error) => {
            console.error('onAuthStateChanged error:', error);
            setAuthError(formatAuthError(error));
            setAuthReady(true);
          }
        );
        return () => unsubscribe();
      } else {
        setAuthReady(true);
      }
    } else {
      setAuthReady(true);
    }
  }, []);

  const loginWithGoogleAuth = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await signInWithGoogle();
      if (res?.isRedirect) {
        // Browser is redirecting to Google sign-in
        return { success: true, isRedirect: true };
      }
      const fbUser = res?.user;
      if (fbUser) {
        const isGoogle = fbUser.providerData?.some((p) => p.providerId === 'google.com') || false;
        const userPayload = {
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.displayName || 'Google Operator',
          photoURL: fbUser.photoURL || null,
          isDemoUser: false,
          isGoogleUser: isGoogle,
          isFirebaseUser: true,
        };
        setUser(userPayload);
        setFirebaseUser(fbUser);
        setFirebaseActive(true);
        return { success: true, user: fbUser };
      }
      return { success: true };
    } catch (err) {
      const friendlyMsg = formatAuthError(err);
      setAuthError(friendlyMsg);
      return { success: false, error: friendlyMsg };
    } finally {
      setLoading(false);
    }
  };

  const loginWithFirebase = async (email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const config = getStoredFirebaseConfig();
      const fb = initFirebase(config);
      if (!fb.success) {
        throw new Error(fb.error || 'Firebase not configured properly.');
      }
      const res = await signInWithEmailAndPassword(fb.auth, email, password);
      const fbUser = res.user;
      setUser({
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || 'Authorized Engineer',
        photoURL: fbUser.photoURL || null,
        isDemoUser: false,
        isGoogleUser: false,
        isFirebaseUser: true,
      });
      setFirebaseUser(fbUser);
      setFirebaseActive(true);
      return { success: true, user: fbUser };
    } catch (err) {
      const friendlyMsg = formatAuthError(err);
      setAuthError(friendlyMsg);
      return { success: false, error: friendlyMsg };
    } finally {
      setLoading(false);
    }
  };

  const loginDemoOperator = (role = 'Safety Operator') => {
    setUser({
      uid: 'operator_demo_' + Math.floor(Math.random() * 900 + 100),
      email: `${role.toLowerCase().replace(/\s+/g, '_')}@anveshak.iot`,
      displayName: role,
      photoURL: null,
      isDemoUser: true,
      isGoogleUser: false,
      isFirebaseUser: false,
    });
    setFirebaseUser(null);
    setAuthError(null);
  };

  const logout = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const config = getStoredFirebaseConfig();
      const fb = initFirebase(config);
      if (fb.success && fb.auth) {
        await fbSignOut(fb.auth);
      }
    } catch (e) {
      console.warn('Signout warning:', e);
    } finally {
      setUser({
        uid: 'guest_observer',
        email: 'guest@anveshak.iot',
        displayName: 'Guest Observer',
        photoURL: null,
        isDemoUser: true,
        isGoogleUser: false,
        isFirebaseUser: false,
      });
      setFirebaseUser(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAuthenticated: Boolean(firebaseUser),
        authReady,
        loading,
        firebaseActive,
        authError,
        setAuthError,
        loginWithGoogle: loginWithGoogleAuth,
        loginWithFirebase,
        loginDemoOperator,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
