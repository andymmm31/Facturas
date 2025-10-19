import 'package:cloud_functions/cloud_functions.dart';

class ReportService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final String appId;

  ReportService(this.appId);

  Future<Map<String, dynamic>> calculateReport({
    required List<String> selectedCompanies,
    required String filterType,
    List<String>? selectedDates,
    String? startDate,
    String? endDate,
    String? rangeType,
  }) async {
    final HttpsCallable callable = _functions.httpsCallable('calculateReport');

    final response = await callable.call(<String, dynamic>{
      'appId': appId,
      'selectedCompanies': selectedCompanies,
      'filterType': filterType,
      'selectedDates': selectedDates,
      'startDate': startDate,
      'endDate': endDate,
      'rangeType': rangeType,
    });

    return Map<String, dynamic>.from(response.data);
  }
}
