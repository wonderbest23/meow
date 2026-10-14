import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// 앱 화면 — 아이폰 상태바·홈 막대 자리(안전 영역)를 페이지 바탕색으로 칠한다.
/// Capacitor 는 이 자리를 한 가지 색(설정의 backgroundColor)으로 고정해서, 흰 화면 위아래에 검은 띠가 생겼다.
/// WebKit 이 계산하는 페이지 바탕색(underPageBackgroundColor)을 지켜보다가 바뀔 때마다 안전 영역에 옮겨 칠한다
/// (검은 첫 화면은 검게, 흰 화면은 희게).
class MainViewController: CAPBridgeViewController {
    private var pageColorObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        webView.underPageBackgroundColor = nil
        pageColorObservation = webView.observe(\.underPageBackgroundColor, options: [.initial, .new]) { [weak self] webView, _ in
            guard let color = webView.underPageBackgroundColor else { return }
            webView.backgroundColor = color
            webView.scrollView.backgroundColor = color
            self?.view.backgroundColor = color
        }
    }
}
