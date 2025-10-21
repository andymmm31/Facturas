import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:frontend_flutter/firebase_options.dart';
import 'package:frontend_flutter/src/services/company_service.dart';
import 'package:frontend_flutter/src/services/invoice_service.dart';
import 'package:intl/intl.dart';

class InvoiceFormWidget extends StatefulWidget {
  final Map<String, dynamic>? invoice;

  const InvoiceFormWidget({super.key, this.invoice});

  @override
  _InvoiceFormWidgetState createState() => _InvoiceFormWidgetState();
}

class _InvoiceFormWidgetState extends State<InvoiceFormWidget> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _invoiceDateController = TextEditingController();
  final _dueDateController = TextEditingController();
  final _companyController = TextEditingController();

  late final InvoiceService _invoiceService;
  late final CompanyService _companyService;

  String? _selectedCompany;
  DateTime? _selectedInvoiceDate;
  DateTime? _selectedDueDate;
  bool _canSave = false;
  bool _isSaving = false;
  String? _amountError;
  String? _invoiceDateError;
  String? _dueDateError;
  List<String>? _oneTimeCompanies;
  bool _triedOneShot = false;
  String? _oneShotError;
  String? _invoiceId;

  @override
  void initState() {
    super.initState();
    final projectId = DefaultFirebaseOptions.currentPlatform.projectId;
    _invoiceService = InvoiceService(projectId);
    _companyService = CompanyService(projectId);

    if (widget.invoice != null) {
      _invoiceId = widget.invoice!['id'];
      _amountController.text = widget.invoice!['amount']?.toString() ?? '';
      _invoiceDateController.text = widget.invoice!['invoiceDate']?.toString() ?? '';
      _dueDateController.text = widget.invoice!['dueDate']?.toString() ?? '';
      _selectedCompany = widget.invoice!['company']?.toString();
      if (_invoiceDateController.text.isNotEmpty) {
        _selectedInvoiceDate = DateTime.tryParse(_invoiceDateController.text);
      }
      if (_dueDateController.text.isNotEmpty) {
        _selectedDueDate = DateTime.tryParse(_dueDateController.text);
      }
    }

    _amountController.addListener(_validateForm);
    _invoiceDateController.addListener(_validateForm);
    _dueDateController.addListener(_validateForm);
    _companyController.addListener(_validateForm);
    _loadCompaniesOnce();
  }

  Future<void> _saveInvoice() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedInvoiceDate == null || _selectedDueDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Selecciona ambas fechas')));
      return;
    }
    if (_selectedInvoiceDate!.isAfter(_selectedDueDate!)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('La fecha de factura no puede ser posterior a la fecha de vencimiento')));
      return;
    }

    setState(() => _isSaving = true);
    try {
      final invoiceData = {
        'company': (_selectedCompany != null && _selectedCompany!.isNotEmpty) ? _selectedCompany! : _companyController.text,
        'amount': double.parse(_amountController.text.replaceAll(',', '.')),
        'invoiceDate': DateFormat('yyyy-MM-dd').format(_selectedInvoiceDate!),
        'dueDate': DateFormat('yyyy-MM-dd').format(_selectedDueDate!),
      };

      if (_invoiceId != null) {
        await _invoiceService.updateInvoice(_invoiceId!, invoiceData);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Factura actualizada con éxito')),
        );
        Navigator.of(context).pop();
      } else {
        final docId = await _invoiceService.addInvoice(
          company: invoiceData['company'] as String,
          amount: invoiceData['amount'] as double,
          invoiceDate: _selectedInvoiceDate!,
          dueDate: _selectedDueDate!,
        );

        _formKey.currentState!.reset();
        _amountController.clear();
        _invoiceDateController.clear();
        _dueDateController.clear();
        _companyController.clear();
        setState(() {
          _selectedCompany = null;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Factura guardada: ${invoiceData['company']} - ${invoiceData['amount']} €')),
        );
      }
    } catch (e) {
      debugPrint('Error guardando factura: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error guardando factura: ${e.toString()}')),
      );
    } finally {
      setState(() => _isSaving = false);
    }
  }

  void _validateForm() {
    String? amountError;
    String? invoiceDateError;
    String? dueDateError;
    final hasCompany = (_selectedCompany != null && _selectedCompany != '__other__') || _companyController.text.isNotEmpty;
    final hasInvoiceDate = _invoiceDateController.text.isNotEmpty;
    final hasDueDate = _dueDateController.text.isNotEmpty;
    if (!hasInvoiceDate) invoiceDateError = 'Selecciona la fecha de factura';
    if (!hasDueDate) dueDateError = 'Selecciona la fecha de vencimiento';

    bool datesValid = true;
    if (_selectedInvoiceDate != null && _selectedDueDate != null) {
      if (_selectedInvoiceDate!.isAfter(_selectedDueDate!)) {
        invoiceDateError = 'La fecha de factura no puede ser posterior a la fecha de vencimiento';
        datesValid = false;
      }
    }

    final can = hasCompany && invoiceDateError == null && dueDateError == null && datesValid;

    if (amountError != _amountError || invoiceDateError != _invoiceDateError || dueDateError != _dueDateError || can != _canSave) {
      setState(() {
        _amountError = amountError;
        _invoiceDateError = invoiceDateError;
        _dueDateError = dueDateError;
        _canSave = can;
      });
    }
  }

  Future<void> _loadCompaniesOnce() async {
    if (_triedOneShot) return;
    _triedOneShot = true;
    debugPrint('Attempting one-shot companies load for project ${_companyService.appId}');
    try {
      final list = await _companyService.getCompaniesOnce();
      debugPrint('One-shot companies loaded: ${list.length}');
      if (list.isNotEmpty) {
        setState(() {
          _oneTimeCompanies = list;
          _selectedCompany = _selectedCompany ?? list.first;
          _oneShotError = null;
        });
      } else {
        setState(() {
          _oneTimeCompanies = <String>[];
          _oneShotError = null;
        });
      }
    } catch (e) {
      debugPrint('Error cargando empresas one-shot: $e');
      setState(() {
        _oneShotError = e.toString();
        _oneTimeCompanies = null;
      });
    }
  }

  Future<void> _selectDate(BuildContext context, {required bool isInvoiceDate}) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2101),
    );
    if (picked != null) {
      setState(() {
        if (isInvoiceDate) {
          _selectedInvoiceDate = picked;
          _invoiceDateController.text = DateFormat('yyyy-MM-dd').format(picked);
        } else {
          _selectedDueDate = picked;
          _dueDateController.text = DateFormat('yyyy-MM-dd').format(picked);
        }
      });
    }
  }

  // _saveInvoice synchronous duplicate removed. Use async _saveInvoice above.

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Container(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Registrar Factura', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 6),
              // Show which Firebase projectId the widget is using (debug help)
              Text('Proyecto: ${_companyService.appId}', style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 20),
              StreamBuilder<QuerySnapshot>(
                stream: _companyService.getCompaniesStream(),
                builder: (context, snapshot) {
                  // If we already loaded companies one-shot (for anonymous users), prefer that list
                  if (_oneTimeCompanies != null) {
                    final original = _oneTimeCompanies!;
                    final companies = List<String>.from(original);
                    // Add an 'Otra...' option to allow custom company
                    companies.add('__other__');

                    if (original.isEmpty) {
                      // No public companies found for anonymous users - show a clear message and retry
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text('No se encontraron empresas públicas para el proyecto ${_companyService.appId}.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withOpacity(0.7)))),
                              TextButton(onPressed: () { setState(() { _triedOneShot = false; _oneShotError = null; _loadCompaniesOnce(); }); }, child: const Text('Reintentar')),
                            ],
                          ),
                          const SizedBox(height: 8),
                          // Fallback free-text input so user can still type the company
                          TextFormField(
                            controller: _companyController,
                            decoration: const InputDecoration(labelText: 'Empresa'),
                            validator: (v) => v == null || v.isEmpty ? 'Campo requerido' : null,
                          ),
                        ],
                      );
                    }

                    if (( _selectedCompany == null || _selectedCompany!.isEmpty) && companies.isNotEmpty) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) {
                          setState(() {
                            _selectedCompany = companies.first;
                          });
                        }
                      });
                    }

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_oneShotError != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8.0),
                            child: Row(
                              children: [
                                Expanded(child: Text('Error cargando empresas: $_oneShotError', style: TextStyle(color: Theme.of(context).colorScheme.error))),
                                TextButton(onPressed: () { setState(() { _triedOneShot = false; _oneShotError = null; _loadCompaniesOnce(); }); }, child: const Text('Reintentar')),
                              ],
                            ),
                          ),
                        DropdownButtonFormField<String>(
                          initialValue: _selectedCompany,
                          hint: const Text('Selecciona una empresa'),
                          onChanged: (String? newValue) => setState(() {
                            _selectedCompany = newValue;
                            if (newValue != '__other__') _companyController.clear();
                          }),
                          items: companies.map<DropdownMenuItem<String>>((String value) {
                            final label = value == '__other__' ? 'Otra...' : value;
                            return DropdownMenuItem<String>(value: value, child: Text(label));
                          }).toList(),
                          validator: (value) {
                            if ((value != null && value != '__other__') || _companyController.text.isNotEmpty) return null;
                            return 'Campo requerido';
                          },
                        ),
                        if (_selectedCompany == '__other__')
                          Padding(
                            padding: const EdgeInsets.only(top: 8.0),
                            child: TextFormField(
                              controller: _companyController,
                              decoration: const InputDecoration(labelText: 'Empresa (otra)'),
                              validator: (v) => v == null || v.isEmpty ? 'Campo requerido' : null,
                            ),
                          ),
                      ],
                    );
                  }

                  // Fallback to stream behavior
                  if (snapshot.hasError) {
                    final err = snapshot.error?.toString() ?? 'Error desconocido';
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Error leyendo empresas desde Firestore: $err', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        Row(
                          children: [
                            TextButton(onPressed: () { setState(() { _triedOneShot = false; _oneShotError = null; _loadCompaniesOnce(); }); }, child: const Text('Reintentar carga one-shot')),
                            TextButton(onPressed: () { setState(() { /* try stream again by rebuilding */ }); }, child: const Text('Reintentar stream')),
                          ],
                        ),
                        const SizedBox(height: 8),
                        // Fallback free-text input so user can still type the company
                        TextFormField(
                          controller: _companyController,
                          decoration: const InputDecoration(labelText: 'Empresa'),
                          validator: (v) => v == null || v.isEmpty ? 'Campo requerido' : null,
                        ),
                      ],
                    );
                  }
                  if (!snapshot.hasData) return const CircularProgressIndicator();
                  var docs = snapshot.data!.docs;
                  if (docs.isNotEmpty && (_selectedCompany == null || _selectedCompany!.isEmpty)) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      setState(() {
                        _selectedCompany = (docs.first.data() as Map<String, dynamic>)['name'] as String?;
                      });
                    });
                  }
                  if (docs.isEmpty) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text('No hay empresas públicas visibles. Es posible que las reglas de Firestore bloqueen la lectura para usuarios anónimos.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withOpacity(0.7)))),
                            TextButton(onPressed: () { setState(() { _triedOneShot = false; _oneShotError = null; _loadCompaniesOnce(); }); }, child: const Text('Reintentar')),
                          ],
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _companyController,
                          decoration: const InputDecoration(labelText: 'Empresa'),
                          validator: (v) => v == null || v.isEmpty ? 'Campo requerido' : null,
                        ),
                      ],
                    );
                  }
                  var companies = docs.map((doc) => doc['name'] as String).toList();
                  // Add an 'Otra...' option to allow custom company
                  companies.add('__other__');
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _selectedCompany,
                        hint: const Text('Selecciona una empresa'),
                        onChanged: (String? newValue) => setState(() {
                          _selectedCompany = newValue;
                          if (newValue != '__other__') _companyController.clear();
                        }),
                        items: companies.map<DropdownMenuItem<String>>((String value) {
                          final label = value == '__other__' ? 'Otra...' : value;
                          return DropdownMenuItem<String>(value: value, child: Text(label));
                        }).toList(),
                        validator: (value) {
                          if ((value != null && value != '__other__') || _companyController.text.isNotEmpty) return null;
                          return 'Campo requerido';
                        },
                      ),
                      if (_selectedCompany == '__other__')
                        Padding(
                          padding: const EdgeInsets.only(top: 8.0),
                          child: TextFormField(
                            controller: _companyController,
                            decoration: const InputDecoration(labelText: 'Empresa (otra)'),
                            validator: (v) => v == null || v.isEmpty ? 'Campo requerido' : null,
                          ),
                        ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _amountController,
                decoration: InputDecoration(labelText: 'Importe (€)', errorText: _amountError),
                keyboardType: TextInputType.number,
                validator: (value) => value!.isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _invoiceDateController,
                decoration: InputDecoration(labelText: 'Fecha de factura', suffixIcon: Icon(Icons.calendar_today), errorText: _invoiceDateError),
                readOnly: true,
                onTap: () => _selectDate(context, isInvoiceDate: true),
                validator: (value) => value!.isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _dueDateController,
                decoration: InputDecoration(labelText: 'Fecha de vencimiento', suffixIcon: Icon(Icons.calendar_today), errorText: _dueDateError),
                readOnly: true,
                onTap: () => _selectDate(context, isInvoiceDate: false),
                validator: (value) => value!.isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: (_canSave && !_isSaving) ? _saveInvoice : null,
                          child: _isSaving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Guardar Factura'),
                        ),
                      ),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _amountController.removeListener(_validateForm);
    _invoiceDateController.removeListener(_validateForm);
    _dueDateController.removeListener(_validateForm);
    _companyController.removeListener(_validateForm);
    _amountController.dispose();
    _invoiceDateController.dispose();
    _dueDateController.dispose();
    _companyController.dispose();
    super.dispose();
  }
}
