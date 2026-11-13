import 'package:flutter/material.dart';

import '../../data/local/app_database.dart';
import '../../domain/entities/user.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({required this.onCompleted, super.key});

  final ValueChanged<User> onCompleted;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _nameController = TextEditingController();
  ProfileType _profile = ProfileType.single;
  bool _consentGiven = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Inserisci il tuo nome.');
      return;
    }
    if (!_consentGiven) {
      setState(() {
        _error = 'Per proseguire è necessario confermare il trattamento locale '
            'dei dati inseriti nell’app.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await AppDatabase.instance.writeSetting('user_name', name);
      await AppDatabase.instance.writeSetting('profile_type', _profile.name);
      widget.onCompleted(
        User(
          id: 'local-user',
          name: name,
          profileType: _profile,
          createdAt: DateTime.now(),
          hasAcknowledgedLocalStorageNotice: true,
          consentAi: false,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Non è stato possibile salvare il profilo: $error';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.event_note, size: 56, color: Color(0xFF176B57)),
                  const SizedBox(height: 16),
                  Text(
                    'Benvenuto in Scadenzario',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Crea un profilo locale per iniziare a organizzare le tue scadenze.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _nameController,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(
                      labelText: 'Come ti chiami?',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _continue(),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<ProfileType>(
                    value: _profile,
                    decoration: const InputDecoration(
                      labelText: 'Profilo',
                      border: OutlineInputBorder(),
                    ),
                    items: ProfileType.values
                        .map(
                          (profile) => DropdownMenuItem(
                            value: profile,
                            child: Text(_profileLabel(profile)),
                          ),
                        )
                        .toList(),
                    onChanged: (profile) {
                      if (profile != null) setState(() => _profile = profile);
                    },
                  ),
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    value: _consentGiven,
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: const Text(
                      'Ho capito che il profilo e le scadenze inserite in questa '
                      'versione restano salvati sul dispositivo.',
                    ),
                    onChanged: (value) {
                      setState(() => _consentGiven = value ?? false);
                    },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _saving ? null : _continue,
                    child: _saving
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Continua'),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Profilo locale, senza account online e senza sincronizzazione. '
                    'Questa versione non usa OCR o servizi AI.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _profileLabel(ProfileType profile) {
    switch (profile) {
      case ProfileType.single:
        return 'Single';
      case ProfileType.coppia:
        return 'Coppia';
      case ProfileType.famiglia:
        return 'Famiglia';
      case ProfileType.anziano:
        return 'Anziano o cura';
      case ProfileType.professionista:
        return 'Professionista';
    }
  }
}
