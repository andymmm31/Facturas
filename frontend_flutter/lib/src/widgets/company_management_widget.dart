import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:frontend_flutter/firebase_options.dart';
import 'package:frontend_flutter/src/services/company_service.dart';

class CompanyManagementWidget extends StatefulWidget {
  const CompanyManagementWidget({super.key});

  @override
  _CompanyManagementWidgetState createState() => _CompanyManagementWidgetState();
}

class _CompanyManagementWidgetState extends State<CompanyManagementWidget> {
  final _companyNameController = TextEditingController();
  late final CompanyService _companyService;
  bool _isAdding = false;
  bool _debugShowDocs = false;

  @override
  void initState() {
    super.initState();
  _companyService = CompanyService(DefaultFirebaseOptions.currentPlatform.projectId);
  }

  void _addCompany() {
    final name = _companyNameController.text.trim();
    if (name.isEmpty) return;
    setState(() {});
    // disable UI while adding by using a local variable
    _addCompanyAsync(name);
  }

  Future<void> _addCompanyAsync(String name) async {
    // show loading in button by disabling it via setState
    setState(() {
      _isAdding = true;
    });
    final docPath = await _companyService.addCompany(name);
    if (docPath != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Empresa añadida: $docPath')));
      _companyNameController.clear();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Error al añadir la empresa')));
    }
    setState(() {
      _isAdding = false;
    });
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
                onPressed: _isAdding ? null : _addCompany,
                child: _isAdding ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Agregar'),
              ),
            ],
          ),
          const SizedBox(height: 30),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Empresas Existentes', style: Theme.of(context).textTheme.titleLarge),
              IconButton(
                tooltip: 'Toggle debug',
                icon: Icon(_debugShowDocs ? Icons.bug_report : Icons.bug_report_outlined),
                onPressed: () => setState(() => _debugShowDocs = !_debugShowDocs),
              ),
            ],
          ),
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

                // Debug print of raw documents to help diagnose hidden companies
                try {
                  debugPrint('Company docs: ${jsonEncode(snapshot.data!.docs.map((d) => d.data()).toList())}');
                } catch (_) {
                  // ignore
                }

                var companies = snapshot.data!.docs;

                return Column(
                  children: [
                    Expanded(
                      child: ListView.builder(
                        itemCount: companies.length,
                        itemBuilder: (context, index) {
                          var company = companies[index];
                          String companyName = '(sin nombre)';
                          try {
                            final data = company.data() as Map<String, dynamic>;
                            if (data.containsKey('name') && data['name'] != null) {
                              companyName = data['name'].toString();
                            }
                          } catch (_) {}

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
                      ),
                    ),
                    if (_debugShowDocs)
                      Container(
                        padding: const EdgeInsets.all(8.0),
                        color: Colors.black12,
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Text(jsonEncode(snapshot.data!.docs.map((d) => d.data()).toList())),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
