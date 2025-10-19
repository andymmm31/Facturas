import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class CompanyService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final String appId;

  CompanyService(this.appId);

  // Stream to get real-time updates of the company list
  Stream<QuerySnapshot> getCompaniesStream() {
    return _firestore.collection('artifacts/$appId/public/data/companies').snapshots();
  }

  // Function to add a new company
  Future<void> addCompany(String companyName) async {
    final HttpsCallable callable = _functions.httpsCallable('addCompany');
    await callable.call(<String, dynamic>{
      'companyName': companyName,
      'appId': appId,
    });
  }

  // Function to edit a company's name
  Future<void> editCompany(String oldName, String newName) async {
    final HttpsCallable callable = _functions.httpsCallable('editCompany');
    await callable.call(<String, dynamic>{
      'oldName': oldName,
      'newName': newName,
      'appId': appId,
    });
  }

  // Function to delete a company
  Future<void> deleteCompany(String companyName) async {
    final HttpsCallable callable = _functions.httpsCallable('deleteCompany');
    await callable.call(<String, dynamic>{
      'companyName': companyName,
      'appId': appId,
    });
  }
}
