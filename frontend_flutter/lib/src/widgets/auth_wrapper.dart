import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:frontend_flutter/src/screens/home_screen.dart';
import 'package:frontend_flutter/src/screens/login_screen.dart';
import 'package:frontend_flutter/src/services/auth_service.dart';

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final authService = AuthService(); // Note: This should be provided by a dependency injection solution later.

    return StreamBuilder<User?>(
      stream: authService.user,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        final user = snapshot.data;

        // If user is logged in (and not anonymous), show home screen.
        // The check for isAnonymous is crucial.
        if (user != null && !user.isAnonymous) {
          return const HomeScreen();
        }

        // Otherwise, show login screen
        return const LoginScreen();
      },
    );
  }
}
