import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../config/firebase.js';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync user profile from Firestore users/{uid}
  const fetchUserProfile = async (user) => {
    if (!user) return;
    const uid = user.uid;
    const profileData = {
      uid: user.uid,
      name: user.displayName || 'User',
      email: user.email || '',
      updatedAt: new Date().toISOString(),
    };

    try {
      const userDocRef = doc(db, 'users', uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        setUserProfile(docSnap.data());
      } else {
        // Create user document if missing
        await setDoc(userDocRef, { ...profileData, createdAt: new Date().toISOString() }, { merge: true });
        setUserProfile(profileData);
      }
    } catch (err) {
      console.warn('Notice: Firestore user profile doc sync:', err.message);
      setUserProfile(profileData);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Register new user
  const register = async ({ name, email, password }) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name in Firebase Auth
    await updateProfile(user, { displayName: name });

    // Store user profile in Firestore: users/{uid}
    const profileData = {
      uid: user.uid,
      name,
      email,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });
      console.log('User profile successfully saved to Firestore users/' + user.uid);
    } catch (err) {
      console.error('Error saving user profile to Firestore:', err);
    }
    setUserProfile(profileData);
    return user;
  };

  // Login user
  const login = async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserProfile(userCredential.user);
    return userCredential.user;
  };

  // Logout user
  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
  };

  const value = {
    currentUser,
    userProfile,
    loading,
    login,
    register,
    logout,
    isConfigured: isFirebaseConfigured,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
