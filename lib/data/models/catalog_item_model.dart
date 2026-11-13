import '../../domain/entities/catalog_item.dart';

class CatalogItemModel {
  final String id;
  final String categoria;
  final String titolo;
  final int mesi;
  final List<String> profili;
  final List<int> promemoria;
  final int giorniSuggeriti;
  final String nota;

  const CatalogItemModel({
    required this.id,
    required this.categoria,
    required this.titolo,
    required this.mesi,
    required this.profili,
    required this.promemoria,
    required this.giorniSuggeriti,
    required this.nota,
  });

  factory CatalogItemModel.fromJson(Map<String, dynamic> json) {
    return CatalogItemModel(
      id: json['id'] as String,
      categoria: json['categoria'] as String,
      titolo: json['titolo'] as String,
      mesi: json['mesi'] as int,
      profili: List<String>.from(json['profili'] as List),
      promemoria: List<int>.from(json['promemoria'] as List),
      giorniSuggeriti: json['giorni_suggeriti'] as int,
      nota: json['nota'] as String,
    );
  }

  CatalogItem toEntity() {
    return CatalogItem(
      id: id,
      categoria: categoria,
      titolo: titolo,
      mesi: mesi,
      profili: profili,
      promemoria: promemoria,
      giorniSuggeriti: giorniSuggeriti,
      nota: nota,
    );
  }
}
