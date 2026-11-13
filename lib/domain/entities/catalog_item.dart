class CatalogItem {
  final String id;
  final String categoria;
  final String titolo;
  final int mesi;
  final List<String> profili;
  final List<int> promemoria;
  final int giorniSuggeriti;
  final String nota;

  const CatalogItem({
    required this.id,
    required this.categoria,
    required this.titolo,
    required this.mesi,
    required this.profili,
    required this.promemoria,
    required this.giorniSuggeriti,
    required this.nota,
  });
}
