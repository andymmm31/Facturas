import 'dart:io' show File;
import 'dart:typed_data';
import 'dart:convert';
import 'package:excel/excel.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

// Only used on web
import 'package:universal_html/html.dart' as html;

// Only used on non-web
import 'package:path_provider/path_provider.dart';

class ExportService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String projectId;

  ExportService(this.projectId);

  /// Exports invoices to Excel. Optional filters:
  /// - selectedCompanies: list of company names to include (null = all)
  /// - startDate/endDate: filter range in YYYY-MM-DD format (inclusive)
  /// - rangeType: 'invoiceDate' or 'dueDate' or 'both' (determines which date field to filter)
  Future<String?> exportInvoicesToExcel({
    String? userId,
    List<String>? selectedCompanies,
    String? startDate,
    String? endDate,
    String rangeType = 'invoiceDate',
  }) async {
    try {
      final collectionPath = 'artifacts/$projectId/public/data/invoices';
      Query query = _firestore.collection(collectionPath).orderBy('timestamp', descending: true);
      if (userId != null) query = query.where('userId', isEqualTo: userId);

      // If companies filter provided, Firestore doesn't support 'in' with large lists in some plans, but small lists are fine
      if (selectedCompanies != null && selectedCompanies.isNotEmpty) {
        query = query.where('company', whereIn: selectedCompanies);
      }

      // Date range filtering: Firestore stores dates as strings YYYY-MM-DD in this project
      // Filter on invoiceDate and/or dueDate depending on rangeType
      if (startDate != null && endDate != null) {
        if (rangeType == 'invoiceDate' || rangeType == 'both') {
          query = query.where('invoiceDate', isGreaterThanOrEqualTo: startDate).where('invoiceDate', isLessThanOrEqualTo: endDate);
        }
        if (rangeType == 'dueDate' || rangeType == 'both') {
          // For 'both' we need to combine results; we'll handle it after fetching (fallback)
        }
      }

      final snapshot = await query.get();

      List<QueryDocumentSnapshot> docs = snapshot.docs;

      // If rangeType == 'both', apply dueDate filtering client-side
      if (startDate != null && endDate != null && (rangeType == 'both')) {
        docs = docs.where((d) {
          final data = d.data() as Map<String, dynamic>?;
          final invoiceDate = data?['invoiceDate']?.toString();
          final dueDate = data?['dueDate']?.toString();
          bool inInvoiceRange = invoiceDate != null && invoiceDate.compareTo(startDate) >= 0 && invoiceDate.compareTo(endDate) <= 0;
          bool inDueRange = dueDate != null && dueDate.compareTo(startDate) >= 0 && dueDate.compareTo(endDate) <= 0;
          return inInvoiceRange || inDueRange;
        }).toList();
      }

  final excel = Excel.createExcel();
  final Sheet sheet = excel['Invoices'];

      // header row for invoices
      sheet.appendRow(['Company', 'Amount', 'Invoice Date', 'Due Date', 'UserId', 'Timestamp']);

      double total = 0.0;
      final Map<String, double> sumByDate = {}; // invoiceDate -> sum

      for (final doc in docs) {
        final data = doc.data() as Map<String, dynamic>?;
        final company = data?['company']?.toString() ?? '';
        final amount = (data?['amount'] is num) ? (data?['amount'] as num).toDouble() : double.tryParse(data?['amount']?.toString() ?? '') ?? 0.0;
        final invoiceDate = data?['invoiceDate']?.toString() ?? '';
        final dueDate = data?['dueDate']?.toString() ?? '';
        final userId = data?['userId']?.toString() ?? '';
        final timestamp = data?['timestamp']?.toString() ?? '';

        total += amount;
  if (invoiceDate.isNotEmpty) sumByDate[invoiceDate] = (sumByDate[invoiceDate] ?? 0.0) + amount;

        sheet.appendRow([company, amount.toStringAsFixed(2), invoiceDate, dueDate, userId, timestamp]);
      }

      // Create summary sheet
      final Sheet summary = excel['Summary'];
      summary.appendRow(['Date', 'Total Amount']);
      final sortedDates = sumByDate.keys.toList()..sort();
      for (final date in sortedDates) {
        summary.appendRow([date, sumByDate[date]!.toStringAsFixed(2)]);
      }
      summary.appendRow(['', '']);
      summary.appendRow(['Total', total.toStringAsFixed(2)]);

      final fileBytes = excel.encode();
      if (fileBytes == null) return null;

      if (kIsWeb) {
  final content = base64Encode(fileBytes);
        final anchor = html.AnchorElement(href: 'data:application/octet-stream;base64,$content')
          ..download = 'invoices.xlsx'
          ..target = 'blank';
        html.document.body!.append(anchor);
        anchor.click();
        anchor.remove();
        return 'downloaded: invoices.xlsx';
      } else {
        final bytes = Uint8List.fromList(fileBytes);
        final dir = await getApplicationDocumentsDirectory();
        final path = '${dir.path}/invoices_${DateTime.now().millisecondsSinceEpoch}.xlsx';
        final file = File(path);
        await file.writeAsBytes(bytes, flush: true);
        return path;
      }
    } catch (e) {
      // Log and return an explicit error string so the UI can display it
      print('Error exporting invoices: $e');
      return 'ERROR: $e';
    }
  }
}
