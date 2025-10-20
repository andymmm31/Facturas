import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class InvoiceService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final String appId;

  InvoiceService(this.appId);

  Future<String> addInvoice({
    required String company,
    required double amount,
    required DateTime invoiceDate,
    required DateTime dueDate,
  }) async {
    final User? currentUser = _auth.currentUser;

    final collectionPath = 'artifacts/$appId/public/data/invoices';
    final ref = await _firestore.collection(collectionPath).add({
      'company': company,
      'amount': amount,
      'invoiceDate': invoiceDate.toIso8601String().split('T').first, // Format as YYYY-MM-DD
      'dueDate': dueDate.toIso8601String().split('T').first,       // Format as YYYY-MM-DD
      'userId': currentUser?.uid ?? 'anonymous',
      'timestamp': FieldValue.serverTimestamp(),
    });

    return ref.id;
  }

  Future<Map<String, dynamic>?> getInvoiceById(String id) async {
    final collectionPath = 'artifacts/$appId/public/data/invoices';
    final doc = await _firestore.collection(collectionPath).doc(id).get();
    if (!doc.exists) return null;
    return doc.data();
  }
}
