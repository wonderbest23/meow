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
///
/// 첫 화면을 불러오는 동안에는 검은 바탕 가운데 로고가 숨 쉬듯 커졌다 작아진다(대표 요청 2026-10-14).
/// 시작 화면(LaunchScreen.storyboard)과 같은 자리·같은 크기(140pt)라 끊김 없이 이어지고, 페이지가 뜨면 사라진다.
class MainViewController: CAPBridgeViewController {
    private var pageColorObservation: NSKeyValueObservation?
    private var loadingObservation: NSKeyValueObservation?
    private var loadingCover: UIView?
    private var loadingStartedAt = Date()

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
        showLoadingCover(over: webView)
        loadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            if !webView.isLoading { self?.hideLoadingCover() }
        }
        // 연결이 끊겨 끝나지 않아도 로고가 화면을 영영 덮지 않게
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in self?.hideLoadingCover() }
    }

    private func showLoadingCover(over host: UIView) {
        let cover = UIView(frame: host.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = .black
        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 140),
            logo.heightAnchor.constraint(equalToConstant: 140),
        ])
        host.addSubview(cover)
        loadingCover = cover
        loadingStartedAt = Date()
        let pulse = CABasicAnimation(keyPath: "transform.scale")
        pulse.fromValue = 1.0
        pulse.toValue = 1.1
        pulse.duration = 0.8
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        logo.layer.add(pulse, forKey: "pulse")
    }

    private func hideLoadingCover() {
        guard let cover = loadingCover else { return }
        loadingCover = nil
        loadingObservation = nil
        // 너무 빨리 뜨면 깜빡이기만 하니 로고가 한 번은 움직이고 사라지게
        let wait = max(0, 0.8 - Date().timeIntervalSince(loadingStartedAt))
        UIView.animate(withDuration: 0.35, delay: wait, options: [.curveEaseOut], animations: {
            cover.alpha = 0
            cover.subviews.first?.transform = CGAffineTransform(scaleX: 1.2, y: 1.2)
        }, completion: { _ in cover.removeFromSuperview() })
    }
}
