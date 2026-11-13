enum ProfileType {
  single,
  coppia,
  famiglia,
  anziano,
  professionista,
}

class User {
  final String id;
  final String name;
  final ProfileType profileType;
  final DateTime createdAt;
  final bool hasAcknowledgedLocalStorageNotice;
  final bool consentAi;

  const User({
    required this.id,
    required this.name,
    required this.profileType,
    required this.createdAt,
    required this.hasAcknowledgedLocalStorageNotice,
    required this.consentAi,
  });
}
