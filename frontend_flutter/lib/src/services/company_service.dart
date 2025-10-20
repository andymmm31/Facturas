import 'package:cloud_firestore/cloud_firestore.dart';

class CompanyService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String appId;

  CompanyService(this.appId);

  // Stream to get real-time updates of the company list
  Stream<QuerySnapshot> getCompaniesStream() {
    return _firestore.collection('artifacts/$appId/public/data/companies').snapshots();
  }

  // Add a new company document under the configured collection.
  // Returns the document path on success, or null on failure.
  Future<String?> addCompany(String companyName) async {
    try {
      final docRef = await _firestore.collection('artifacts/$appId/public/data/companies').add({
        'name': companyName,
        'createdAt': FieldValue.serverTimestamp(),
      });
      return docRef.path; // e.g. artifacts/{projectId}/public/data/companies/{docId}
    } catch (e) {
      // ignore: avoid_print
      print('Error adding company: $e');
      return null;
    }
  }

  // Edit a company's name by finding the document with matching name and updating it.
  Future<bool> editCompany(String oldName, String newName) async {
    try {
      final query = await _firestore
          .collection('artifacts/$appId/public/data/companies')
          .where('name', isEqualTo: oldName)
          .limit(1)
          .get();
      if (query.docs.isEmpty) return false;
      await query.docs.first.reference.update({'name': newName});
      return true;
    } catch (e) {
      // ignore: avoid_print
      print('Error editing company: $e');
      return false;
    }
  }

  // Delete a company by name (deletes first match).
  Future<bool> deleteCompany(String companyName) async {
    try {
      final query = await _firestore
          .collection('artifacts/$appId/public/data/companies')
          .where('name', isEqualTo: companyName)
          .limit(1)
          .get();
      if (query.docs.isEmpty) return false;
      await query.docs.first.reference.delete();
      return true;
    } catch (e) {
      // ignore: avoid_print
      print('Error deleting company: $e');
      return false;
    }
  }

  /// One-shot read of company names. Useful if the stream is not delivering
  /// (e.g. due to rules not deployed) — this lets the UI attempt a manual load.
  Future<List<String>> getCompaniesOnce() async {
    final snapshot = await _firestore.collection('artifacts/$appId/public/data/companies').get();
    return snapshot.docs.map((d) => (d.data()['name'] as String?) ?? '').where((s) => s.isNotEmpty).toList();
  }
}
