import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:frontend_flutter/firebase_options.dart';
import 'package:frontend_flutter/src/services/company_service.dart';
import 'package:frontend_flutter/src/services/invoice_service.dart';
import 'package:intl/intl.dart';

class InvoiceFormWidget extends StatefulWidget {
  const InvoiceFormWidget({Key? key}) : super(key: key);

  @override
  _InvoiceFormWidgetState createState() => _InvoiceFormWidgetState();
}

class _InvoiceFormWidgetState extends State<InvoiceFormWidget> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _invoiceDateController = TextEditingController();
  final _dueDateController = TextEditingController();

  late final InvoiceService _invoiceService;
  late final CompanyService _companyService;

  String? _selectedCompany;
  DateTime? _selectedInvoiceDate;
  DateTime? _selectedDueDate;

  @override
  void initState() {
    super.initState();
    final appId = DefaultFirebaseOptions.currentPlatform.appId;
    _invoiceService = InvoiceService(appId);
    _companyService = CompanyService(appId);
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

  void _saveInvoice() {
    if (_formKey.currentState!.validate()) {
      _invoiceService.addInvoice(
        company: _selectedCompany!,
        amount: double.parse(_amountController.text),
        invoiceDate: _selectedInvoiceDate!,
        dueDate: _selectedDueDate!,
      );
      // Reset form
      _formKey.currentState!.reset();
      _amountController.clear();
      _invoiceDateController.clear();
      _dueDateController.clear();
      setState(() {
        _selectedCompany = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Factura guardada con éxito')),
      );
    }
  }

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
              const SizedBox(height: 20),
              StreamBuilder<QuerySnapshot>(
                stream: _companyService.getCompaniesStream(),
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const CircularProgressIndicator();
                  var companies = snapshot.data!.docs.map((doc) => doc['name'] as String).toList();
                  return DropdownButtonFormField<String>(
                    value: _selectedCompany,
                    hint: const Text('Selecciona una empresa'),
                    onChanged: (String? newValue) => setState(() => _selectedCompany = newValue),
                    items: companies.map<DropdownMenuItem<String>>((String value) {
                      return DropdownMenuItem<String>(value: value, child: Text(value));
                    }).toList(),
                    validator: (value) => value == null ? 'Campo requerido' : null,
                  );
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _amountController,
                decoration: const InputDecoration(labelText: 'Importe (€)'),
                keyboardType: TextInputType.number,
                validator: (value) => value!.isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _invoiceDateController,
                decoration: const InputDecoration(labelText: 'Fecha de factura', suffixIcon: Icon(Icons.calendar_today)),
                readOnly: true,
                onTap: () => _selectDate(context, isInvoiceDate: true),
                validator: (value) => value!.isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _dueDateController,
                decoration: const InputDecoration(labelText: 'Fecha de vencimiento', suffixIcon: Icon(Icons.calendar_today)),
                readOnly: true,
                onTap: () => _selectDate(context, isInvoiceDate: false),
                validator: (value) => value!.isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _saveInvoice,
                  child: const Text('Guardar Factura'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
