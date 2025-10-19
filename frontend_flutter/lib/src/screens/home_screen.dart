import 'package:flutter/material.dart';
import 'package:frontend_flutter/src/services/auth_service.dart';
import 'package:frontend_flutter/src/widgets/company_management_widget.dart';
import 'package:frontend_flutter/src/widgets/invoice_form_widget.dart';
import 'package:frontend_flutter/src/widgets/report_widget.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final authService = AuthService();

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Gestión de Facturas'),
          actions: [
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () => authService.signOut(),
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.business), text: 'Empresas'),
              Tab(icon: Icon(Icons.receipt), text: 'Registrar'),
              Tab(icon: Icon(Icons.analytics), text: 'Reportes'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            CompanyManagementWidget(),
            InvoiceFormWidget(),
            ReportWidget(),
          ],
        ),
      ),
    );
  }
}
