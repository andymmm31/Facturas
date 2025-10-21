import 'package:cloud_functions/cloud_functions.dart';

class ReportService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final String appId;

  ReportService(this.appId);

  Future<Map<String, dynamic>> calculateReport({
    required List<String> selectedCompanies,
    String? startDate,
    String? endDate,
    String? rangeType,
  }) async {
    try {
      final HttpsCallable callable = _functions.httpsCallable('calculateReport');
      final result = await callable.call<Map<String, dynamic>>({
        'appId': appId,
        'selectedCompanies': selectedCompanies,
        'startDate': startDate,
        'endDate': endDate,
        'rangeType': rangeType,
      });

      // The result.data is already a Map<String, dynamic>, but invoice amounts might be int.
      // We ensure amounts are doubles for consistency in the frontend.
      final data = result.data;
      final invoices = (data['invoices'] as List<dynamic>?)?.map((invoice) {
        final inv = Map<String, dynamic>.from(invoice);
        if (inv['amount'] is int) {
          inv['amount'] = (inv['amount'] as int).toDouble();
        }
        return inv;
      }).toList();
      data['invoices'] = invoices;

      return data;
    } on FirebaseFunctionsException catch (e) {
      print('Error al llamar a la función de Firebase: ${e.code} - ${e.message}');
      return {
        'totalSum': 0.0,
        'invoiceCount': 0,
        'invoices': [],
        'error': e.message,
      };
    } catch (e) {
      print('Error inesperado: $e');
      return {
        'totalSum': 0.0,
        'invoiceCount': 0,
        'invoices': [],
        'error': 'Ocurrió un error inesperado.',
      };
    }
  }
}
