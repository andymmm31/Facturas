import 'package:flutter/material.dart';
import 'package:frontend_flutter/src/services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _authService = AuthService();

  String _errorMessage = '';
  bool _isLoading = false;

  Future<void> _login() async {
    if (_formKey.currentState!.validate()) {
      setState(() {
        _isLoading = true;
        _errorMessage = '';
      });

      final result = await _authService.signInWithUsernameAndPassword(
        _usernameController.text.trim(),
        _passwordController.text,
      );

      if (result.credential != null) {
        // Success: AuthWrapper or auth state listener will navigate away.
        setState(() {
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage = result.errorMessage ?? 'Credenciales incorrectas. Por favor, inténtalo de nuevo.';
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Form(
            key: _formKey,
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Iniciar Sesión', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _usernameController,
                    decoration: const InputDecoration(labelText: 'Usuario', border: OutlineInputBorder()),
                    validator: (value) => value!.isEmpty ? 'Por favor, introduce tu usuario' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _passwordController,
                    decoration: const InputDecoration(labelText: 'Contraseña', border: OutlineInputBorder()),
                    obscureText: true,
                    validator: (value) => value!.isEmpty ? 'Por favor, introduce tu contraseña' : null,
                  ),
                  const SizedBox(height: 20),
                  if (_errorMessage.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10.0),
                      child: Text(_errorMessage, style: const TextStyle(color: Colors.red)),
                    ),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _login,
                      child: _isLoading ? const CircularProgressIndicator() : const Text('Entrar'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => _showForgotPasswordDialog(context),
                    child: const Text('¿Olvidaste la contraseña?'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showForgotPasswordDialog(BuildContext context) {
    final emailController = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Restablecer contraseña'),
        content: TextField(
          controller: emailController,
          decoration: const InputDecoration(labelText: 'Introduce tu correo'),
          keyboardType: TextInputType.emailAddress,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancelar')),
          TextButton(
            onPressed: () async {
              final email = emailController.text.trim();
              if (email.isEmpty) return;
              Navigator.of(context).pop();
              final msg = await _authService.sendPasswordResetEmail(email);
              if (msg == null) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Email de restablecimiento enviado')));
              } else {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $msg')));
              }
            },
            child: const Text('Enviar'),
          ),
        ],
      ),
    );
  }
}
