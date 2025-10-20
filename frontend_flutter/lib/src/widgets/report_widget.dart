import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:frontend_flutter/firebase_options.dart';
import 'package:frontend_flutter/src/services/company_service.dart';
import 'package:frontend_flutter/src/services/report_service.dart';
import 'package:frontend_flutter/src/services/export_service.dart';
import 'package:intl/intl.dart';

class ReportWidget extends StatefulWidget {
  const ReportWidget({super.key});

  @override
  _ReportWidgetState createState() => _ReportWidgetState();
}

class _ReportWidgetState extends State<ReportWidget> {
  late final ReportService _reportService;
  late final CompanyService _companyService;

  Map<String, bool> _selectedCompanies = {};
  final String _filterType = 'range'; // 'range', 'invoiceDate', 'dueDate'
  DateTime? _startDate;
  DateTime? _endDate;
  final String _rangeType = 'invoiceDate'; // 'invoiceDate', 'dueDate', 'both'

  Map<String, dynamic>? _reportResult;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final appId = DefaultFirebaseOptions.currentPlatform.appId;
    _reportService = ReportService(appId);
  _companyService = CompanyService(DefaultFirebaseOptions.currentPlatform.projectId);
  }

  Future<void> _selectDate(BuildContext context, bool isStart) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2101),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDate = picked;
        } else {
          _endDate = picked;
        }
      });
    }
  }

  void _calculateReport() async {
    setState(() => _isLoading = true);
    final result = await _reportService.calculateReport(
      selectedCompanies: _selectedCompanies.entries.where((e) => e.value).map((e) => e.key).toList(),
      filterType: _filterType,
      startDate: _startDate?.toIso8601String().split('T').first,
      endDate: _endDate?.toIso8601String().split('T').first,
      rangeType: _rangeType,
    );
    setState(() {
      _reportResult = result;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Container(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Reporte Acumulado', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 20),
            _buildFilters(),
            const SizedBox(height: 20),
            _buildResults(),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8.0),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Filtros', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 10),
          _buildCompanySelector(),
          const SizedBox(height: 20),
          // For simplicity, we are only implementing the 'range' filter type for now.
          _buildDateRangePicker(),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _calculateReport,
                    child: _isLoading ? const CircularProgressIndicator() : const Text('Calcular Total'),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: () async {
                    final projectId = DefaultFirebaseOptions.currentPlatform.projectId;
                    final exportService = ExportService(projectId);
                    final selected = _selectedCompanies.entries.where((e) => e.value).map((e) => e.key).toList();
                    final result = await exportService.exportInvoicesToExcel(
                      selectedCompanies: selected.isEmpty ? null : selected,
                      startDate: _startDate?.toIso8601String().split('T').first,
                      endDate: _endDate?.toIso8601String().split('T').first,
                      rangeType: _rangeType,
                    );
                    if (result != null) {
                      if (result.startsWith('ERROR:')) {
                        print(result);
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result)));
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Exportado: $result')));
                      }
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Error al exportar')));
                    }
                  },
                  child: const Text('Exportar Reporte'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCompanySelector() {
    return StreamBuilder<QuerySnapshot>(
      stream: _companyService.getCompaniesStream(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        var companies = snapshot.data!.docs;
        if (_selectedCompanies.isEmpty && companies.isNotEmpty) {
          _selectedCompanies = { for (var item in companies) item['name'] : false };
        }
        return Wrap(
          spacing: 8.0,
          runSpacing: 4.0,
          children: _selectedCompanies.keys.map((String key) {
            return FilterChip(
              label: Text(key),
              selected: _selectedCompanies[key]!,
              onSelected: (bool value) {
                setState(() => _selectedCompanies[key] = value);
              },
            );
          }).toList(),
        );
      },
    );
  }

  Widget _buildDateRangePicker() {
    return Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: () => _selectDate(context, true),
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Fecha de inicio'),
              child: Text(_startDate != null ? DateFormat('yyyy-MM-dd').format(_startDate!) : 'No seleccionada'),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: InkWell(
            onTap: () => _selectDate(context, false),
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Fecha de fin'),
              child: Text(_endDate != null ? DateFormat('yyyy-MM-dd').format(_endDate!) : 'No seleccionada'),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildResults() {
    final totalSum = _reportResult?['totalSum'] ?? 0.0;
    final invoiceCount = _reportResult?['invoiceCount'] ?? 0;
    final invoices = (_reportResult?['invoices'] as List<dynamic>?) ?? <dynamic>[];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24.0),
      decoration: BoxDecoration(
        color: Colors.teal.shade50,
        borderRadius: BorderRadius.circular(8.0),
      ),
      child: Column(
        children: [
          Text(
            'Total para la selección ($invoiceCount facturas)',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            '${totalSum.toStringAsFixed(2)} €',
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
              color: Colors.teal.shade700,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 18),
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Historial de facturas', style: Theme.of(context).textTheme.titleMedium),
          ),
          const SizedBox(height: 8),
          invoices.isEmpty
              ? const Text('No hay facturas para los filtros seleccionados.')
              : SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Empresa')),
                      DataColumn(label: Text('Importe')),
                      DataColumn(label: Text('Fecha factura')),
                      DataColumn(label: Text('Fecha vencimiento')),
                    ],
                    rows: invoices.map((inv) {
                      final company = inv['company']?.toString() ?? '';
                      final amount = (inv['amount'] is num) ? (inv['amount'] as num).toDouble() : double.tryParse(inv['amount']?.toString() ?? '') ?? 0.0;
                      final invoiceDate = inv['invoiceDate']?.toString() ?? '';
                      final dueDate = inv['dueDate']?.toString() ?? '';
                      return DataRow(cells: [
                        DataCell(Text(company)),
                        DataCell(Text('${amount.toStringAsFixed(2)} €')),
                        DataCell(Text(invoiceDate)),
                        DataCell(Text(dueDate)),
                      ]);
                    }).toList(),
                  ),
                ),
        ],
      ),
    );
  }
}
