import 'package:cloud_firestore/cloud_firestore.dart';

class ReportService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String appId;

  ReportService(this.appId);

  /// Calculate report locally by querying Firestore. Returns a map with:
  /// - totalSum: double
  /// - invoiceCount: int
  /// - sumByDate: Map<String,double> (sums per invoiceDate)
  Future<Map<String, dynamic>> calculateReport({
    required List<String> selectedCompanies,
    required String filterType,
    List<String>? selectedDates,
    String? startDate,
    String? endDate,
    String? rangeType,
  }) async {
    final collectionPath = 'artifacts/$appId/public/data/invoices';

    Query query = _firestore.collection(collectionPath);

    if (selectedCompanies.isNotEmpty) {
      // Firestore supports whereIn up to 10 items; if more, fetch all and filter client-side
      if (selectedCompanies.length <= 10) {
        query = query.where('company', whereIn: selectedCompanies);
      }
    }

    // If startDate/endDate provided and rangeType is invoiceDate, we can filter server-side
    if (startDate != null && endDate != null && (rangeType == 'invoiceDate')) {
      query = query.where('invoiceDate', isGreaterThanOrEqualTo: startDate).where('invoiceDate', isLessThanOrEqualTo: endDate);
    }

    final snapshot = await query.get();

    List<QueryDocumentSnapshot> docs = snapshot.docs;

    // If selectedCompanies too large, filter client-side
    if (selectedCompanies.isNotEmpty && selectedCompanies.length > 10) {
      docs = docs.where((d) {
        final data = d.data() as Map<String, dynamic>?;
        final company = data?['company']?.toString() ?? '';
        return selectedCompanies.contains(company);
      }).toList();
    }

    // If filtering by dueDate or both, apply client-side filtering
    if (startDate != null && endDate != null && (rangeType == 'dueDate' || rangeType == 'both')) {
      docs = docs.where((d) {
        final data = d.data() as Map<String, dynamic>?;
        final invoiceDate = data?['invoiceDate']?.toString();
        final dueDate = data?['dueDate']?.toString();
        if (rangeType == 'dueDate') {
          return dueDate != null && dueDate.compareTo(startDate) >= 0 && dueDate.compareTo(endDate) <= 0;
        }
        // both: include if either date is in range
        final inInvoice = invoiceDate != null && invoiceDate.compareTo(startDate) >= 0 && invoiceDate.compareTo(endDate) <= 0;
        final inDue = dueDate != null && dueDate.compareTo(startDate) >= 0 && dueDate.compareTo(endDate) <= 0;
        return inInvoice || inDue;
      }).toList();
    }

    double total = 0.0;
    final Map<String, double> sumByDate = {};

    for (final doc in docs) {
      final data = doc.data() as Map<String, dynamic>?;
      final amount = (data?['amount'] is num) ? (data!['amount'] as num).toDouble() : double.tryParse(data?['amount']?.toString() ?? '') ?? 0.0;
      final invoiceDate = data?['invoiceDate']?.toString() ?? '';
      total += amount;
      if (invoiceDate.isNotEmpty) sumByDate[invoiceDate] = (sumByDate[invoiceDate] ?? 0.0) + amount;
    }

    return {
      'totalSum': total,
      'invoiceCount': docs.length,
      'sumByDate': sumByDate,
      'invoices': docs.map((d) {
        final data = d.data() as Map<String, dynamic>?;
        return {
          'company': data?['company']?.toString() ?? '',
          'amount': (data?['amount'] is num) ? (data!['amount'] as num).toDouble() : double.tryParse(data?['amount']?.toString() ?? '') ?? 0.0,
          'invoiceDate': data?['invoiceDate']?.toString() ?? '',
          'dueDate': data?['dueDate']?.toString() ?? '',
          'userId': data?['userId']?.toString() ?? '',
          'timestamp': data?['timestamp']?.toString() ?? '',
        };
      }).toList(),
    };
  }
}
