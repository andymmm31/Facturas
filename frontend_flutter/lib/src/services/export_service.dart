import 'dart:io' show File;
import 'dart:typed_data';
import 'dart:convert';
import 'package:excel/excel.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

// Only used on web
import 'package:universal_html/html.dart' as html;

// Only used on non-web
import 'package:path_provider/path_provider.dart';

class ExportService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final String appId;

  ExportService(this.appId);

  Future<String?> exportInvoicesToExcel({
    List<String>? selectedCompanies,
    String? startDate,
    String? endDate,
    String rangeType = 'invoiceDate',
  }) async {
    try {
      final HttpsCallable callable = _functions.httpsCallable('exportInvoices');
      final result = await callable.call<Map<String, dynamic>>({
        'appId': appId,
        'selectedCompanies': selectedCompanies,
        'startDate': startDate,
        'endDate': endDate,
        'rangeType': rangeType,
      });

      final invoices = (result.data['invoices'] as List<dynamic>?) ?? [];

      final excel = Excel.createExcel();
      final Sheet sheet = excel['Invoices'];

      sheet.appendRow(['Company', 'Amount', 'Invoice Date', 'Due Date', 'UserId', 'Timestamp']);

      double total = 0.0;
      final Map<String, double> sumByDate = {};

      for (final inv in invoices) {
        final data = Map<String, dynamic>.from(inv);
        final company = data['company']?.toString() ?? '';
        final amount = (data['amount'] is num) ? (data['amount'] as num).toDouble() : double.tryParse(data['amount']?.toString() ?? '') ?? 0.0;
        final invoiceDate = data['invoiceDate']?.toString() ?? '';
        final dueDate = data['dueDate']?.toString() ?? '';
        final userId = data['userId']?.toString() ?? '';
        final timestamp = data['timestamp']?.toString() ?? '';

        total += amount;
        if (invoiceDate.isNotEmpty) sumByDate[invoiceDate] = (sumByDate[invoiceDate] ?? 0.0) + amount;

        sheet.appendRow([company, amount.toStringAsFixed(2), invoiceDate, dueDate, userId, timestamp]);
      }

      final Sheet summary = excel['Summary'];
      summary.appendRow(['Date', 'Total Amount']);
      final sortedDates = sumByDate.keys.toList()..sort();
      for (final date in sortedDates) {
        summary.appendRow([date, sumByDate[date]!.toStringAsFixed(2)]);
      }
      summary.appendRow(['', '']);
      summary.appendRow(['Total', total.toStringAsFixed(2)]);

      final fileBytes = excel.encode();
      if (fileBytes == null) return 'ERROR: Could not encode Excel file.';

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
    } on FirebaseFunctionsException catch (e) {
      print('Firebase Functions Error: ${e.code} - ${e.message}');
      return 'ERROR: ${e.message}';
    } catch (e) {
      print('Error exporting invoices: $e');
      return 'ERROR: An unexpected error occurred.';
    }
  }
}
