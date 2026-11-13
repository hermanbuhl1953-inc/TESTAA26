class Member {
  final String id;
  final String userId;
  final String name;
  final String? relation;
  final DateTime createdAt;

  const Member({
    required this.id,
    required this.userId,
    required this.name,
    this.relation,
    required this.createdAt,
  });
}
