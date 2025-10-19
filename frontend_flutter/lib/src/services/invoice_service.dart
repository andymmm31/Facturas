import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class InvoiceService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final String appId;

  InvoiceService(this.appId);

  Future<void> addInvoice({
    required String company,
    required double amount,
    required DateTime invoiceDate,
    required DateTime dueDate,
  }) async {
    final User? currentUser = _auth.currentUser;
    if (currentUser == null) {
      throw Exception('No authenticated user found.');
    }

    final collectionPath = 'artifacts/$appId/public/data/invoices';

    await _firestore.collection(collectionPath).add({
      'company': company,
      'amount': amount,
      'invoiceDate': invoiceDate.toIso8601String().split('T').first, // Format as YYYY-MM-DD
      'dueDate': dueDate.toIso8601String().split('T').first,       // Format as YYYY-MM-DD
      'userId': currentUser.uid,
      'timestamp': FieldValue.serverTimestamp(),
    });
  }
}
