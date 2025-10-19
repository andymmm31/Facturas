import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:frontend_flutter/firebase_options.dart';
import 'package:frontend_flutter/src/services/company_service.dart';

class CompanyManagementWidget extends StatefulWidget {
  const CompanyManagementWidget({Key? key}) : super(key: key);

  @override
  _CompanyManagementWidgetState createState() => _CompanyManagementWidgetState();
}

class _CompanyManagementWidgetState extends State<CompanyManagementWidget> {
  final _companyNameController = TextEditingController();
  late final CompanyService _companyService;

  @override
  void initState() {
    super.initState();
    _companyService = CompanyService();
  }

  void _addCompany() {
    if (_companyNameController.text.isNotEmpty) {
      _companyService.addCompany(_companyNameController.text);
      _companyNameController.clear();
    }
  }

  void _showEditDialog(String oldName) {
    final editController = TextEditingController(text: oldName);
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Editar Empresa'),
          content: TextFormField(
            controller: editController,
            decoration: const InputDecoration(labelText: 'Nuevo nombre'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () {
                if (editController.text.isNotEmpty) {
                  _companyService.editCompany(oldName, editController.text);
                  Navigator.of(context).pop();
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Gestionar Empresas', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _companyNameController,
                  decoration: const InputDecoration(
                    labelText: 'Nombre de la nueva empresa',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              ElevatedButton(
                onPressed: _addCompany,
                child: const Text('Agregar'),
              ),
            ],
          ),
          const SizedBox(height: 30),
          Text('Empresas Existentes', style: Theme.of(context).textTheme.titleLarge),
          const Divider(),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _companyService.getCompaniesStream(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return const Center(child: Text('No hay empresas registradas.'));
                }

                var companies = snapshot.data!.docs;

                return ListView.builder(
                  itemCount: companies.length,
                  itemBuilder: (context, index) {
                    var company = companies[index];
                    String companyName = company['name'];

                    return ListTile(
                      title: Text(companyName),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit, color: Colors.blue),
                            onPressed: () => _showEditDialog(companyName),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () {
                              _companyService.deleteCompany(companyName);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
