import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../data/local/app_database.dart';
import '../domain/entities/user.dart';
import '../presentation/deadlines/deadline_list_screen.dart';
import '../presentation/onboarding/onboarding_screen.dart';

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Scadenzario',
      debugShowCheckedModeBanner: false,
      locale: const Locale('it', 'IT'),
      supportedLocales: const [Locale('it', 'IT')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF176B57)),
      ),
      home: const _AppStartup(),
    );
  }
}

class _AppStartup extends StatefulWidget {
  const _AppStartup();

  @override
  State<_AppStartup> createState() => _AppStartupState();
}

class _AppStartupState extends State<_AppStartup> {
  late final Future<User?> _userFuture = _loadUser();

  Future<User?> _loadUser() async {
    final database = AppDatabase.instance;
    final name = await database.readSetting('user_name');
    final profileValue = await database.readSetting('profile_type');
    if (name == null || profileValue == null) return null;

    final profile = ProfileType.values.firstWhere(
      (value) => value.name == profileValue,
      orElse: () => throw StateError('Profilo locale non valido: $profileValue'),
    );
    return User(
      id: 'local-user',
      name: name,
      profileType: profile,
      createdAt: DateTime.now(),
      hasAcknowledgedLocalStorageNotice: true,
      consentAi: false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User?>(
      future: _userFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _StartupError(error: snapshot.error!);
        }
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snapshot.data;
        if (user == null) {
          return OnboardingScreen(
            onCompleted: (createdUser) {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute<void>(
                  builder: (_) => DeadlineListScreen(user: createdUser),
                ),
              );
            },
          );
        }
        return DeadlineListScreen(user: user);
      },
    );
  }
}

class _StartupError extends StatelessWidget {
  const _StartupError({required this.error});

  final Object error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Impossibile aprire i dati locali.\n$error'),
        ),
      ),
    );
  }
}
