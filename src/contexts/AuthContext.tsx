import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserData {
    uid: string;
    email: string | null;
    displayName: string | null;
    isPremium: boolean;
    snsRewardMinutes: number;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: number;
}



interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    loading: true,
    signInWithGoogle: async () => { },
    logout: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let disposed = false;
        let authVersion = 0;
        let unsubscribeDoc: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (disposed) return;
            const version = ++authVersion;
            const isCurrent = () => !disposed && version === authVersion;
            unsubscribeDoc?.();
            unsubscribeDoc = undefined;
            setUser(currentUser);
            setUserData(null);

            if (!currentUser) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Sync user data to Firestore if it doesn't exist
                const userRef = doc(db, 'users', currentUser.uid);
                const userSnap = await getDoc(userRef);
                if (!isCurrent()) return;

                if (!userSnap.exists()) {
                    await setDoc(userRef, {
                        email: currentUser.email,
                        displayName: currentUser.displayName,
                        isPremium: false,
                        snsRewardMinutes: 60, // Default 60 mins for free users
                        createdAt: new Date()
                    });
                }
                if (!isCurrent()) return;

                // Listen to user document changes
                unsubscribeDoc = onSnapshot(userRef, (docSnap) => {
                    if (!isCurrent()) return;
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setUserData({
                            uid: currentUser.uid,
                            email: currentUser.email,
                            displayName: currentUser.displayName,
                            isPremium: data.isPremium === true,
                            snsRewardMinutes: data.snsRewardMinutes || (data.isPremium ? 10 : 60),
                            cancelAtPeriodEnd: data.cancelAtPeriodEnd,
                            currentPeriodEnd: data.currentPeriodEnd,
                        });
                    } else {
                        setUserData(null);
                    }
                    setLoading(false);
                }, (error) => {
                    if (!isCurrent()) return;
                    console.error('Failed to watch user data:', error);
                    setUserData(null);
                    setLoading(false);
                });
            } catch (error) {
                if (!isCurrent()) return;
                console.error('Failed to initialize user data:', error);
                setUserData(null);
                setLoading(false);
            }
        });

        return () => {
            disposed = true;
            ++authVersion;
            unsubscribeDoc?.();
            unsubscribeAuth();
        };
    }, []);

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };

    const logout = async () => {
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, userData, loading, signInWithGoogle, logout }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
