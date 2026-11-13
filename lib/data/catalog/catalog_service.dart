import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../../domain/entities/catalog_item.dart';
import '../models/catalog_item_model.dart';

class CatalogService {
  Future<List<CatalogItem>> loadCatalog() async {
    final raw = await rootBundle.loadString('assets/catalog/deadlines.json');
    final decoded = jsonDecode(raw) as List<dynamic>;

    final items = decoded
        .map((item) => CatalogItemModel.fromJson(item as Map<String, dynamic>))
        .map((model) => model.toEntity())
        .toList();

    return items;
  }
}
