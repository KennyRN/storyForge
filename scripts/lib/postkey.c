// Posts one key (down, then up) to ONE process, never to the frontmost app (decision 90). Built on demand by postKeys.mjs.
//   postkey [--dry] <pid> <keycode> <flags> [<text>]
// <text>, if given, is carried by the event itself (CGEventKeyboardSetUnicodeString), so the character typed does not depend on the Mac's
// keyboard layout (decision 91). With --dry nothing is posted: the event is made and what it carries is printed (for the tests).
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
	int dry = argc > 1 && strcmp(argv[1], "--dry") == 0;
	int a = dry ? 2 : 1;
	if (argc - a < 3) return 2;
	pid_t pid = (pid_t)atoi(argv[a]);
	CGKeyCode code = (CGKeyCode)atoi(argv[a + 1]);
	CGEventFlags flags = (CGEventFlags)strtoull(argv[a + 2], NULL, 10);
	if (!dry && pid <= 1) return 6;
	UniChar buf[16];
	CFIndex n = 0;
	if (argc - a >= 4) {
		CFStringRef s = CFStringCreateWithCString(NULL, argv[a + 3], kCFStringEncodingUTF8);
		if (!s) return 3;
		n = CFStringGetLength(s);
		if (n > 16) return 4;
		CFStringGetCharacters(s, CFRangeMake(0, n), buf);
		CFRelease(s);
	}
	for (int down = 1; down >= 0; down--) {
		CGEventRef e = CGEventCreateKeyboardEvent(NULL, code, down);
		if (!e) return 5;
		CGEventSetFlags(e, flags);
		if (n) CGEventKeyboardSetUnicodeString(e, n, buf);
		if (dry) {
			UniChar out[16];
			UniCharCount len = 0;
			CGEventKeyboardGetUnicodeString(e, 16, &len, out);
			printf("%s code=%d flags=%llu text=", down ? "down" : "up", (int)CGEventGetIntegerValueField(e, kCGKeyboardEventKeycode), (unsigned long long)CGEventGetFlags(e));
			for (UniCharCount i = 0; i < len; i++) printf("U+%04X ", out[i]);
			printf("\n");
		} else {
			CGEventPostToPid(pid, e);
			usleep(8000);
		}
		CFRelease(e);
	}
	return 0;
}
