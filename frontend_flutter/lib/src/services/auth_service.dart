import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

class AuthService {
  final FirebaseAuth _firebaseAuth = FirebaseAuth.instance;

  Stream<User?> get user => _firebaseAuth.authStateChanges();

  Future<UserCredential?> signInWithUsernameAndPassword(String username, String password) async {
    try {
      // Replicate the "dummy email" strategy
      final String email = '$username@invoicereports.com';

      // First, sign in anonymously if there is no current user
      if (_firebaseAuth.currentUser == null) {
        await _firebaseAuth.signInAnonymously();
      }

      // Then, link the anonymous user with the email/password credential
      final credential = EmailAuthProvider.credential(email: email, password: password);
      return await _firebaseAuth.currentUser?.linkWithCredential(credential);

    } on FirebaseAuthException catch (e) {
      // Handle specific auth errors
      debugPrint(e.toString());
      return null;
    } catch (e) {
      debugPrint(e.toString());
      return null;
    }
  }

  Future<void> signOut() async {
    await _firebaseAuth.signOut();
    // After signing out, sign back in anonymously for basic read access
    await _firebaseAuth.signInAnonymously();
  }
}
