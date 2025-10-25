"""本のバーコードからISBNを取得し、Google & 楽天APIで情報を統合してAstro Contentsに追加するスクリプト"""

import shutil

from config import OUTPUT_DIR
from core import process_single_book
from scanners import continuous_barcode_scan, read_barcode_from_camera
from utils import log_message, setup_directories


def clear_output_directory():
    """outputディレクトリを削除するか確認"""
    if OUTPUT_DIR.exists():
        print("\n" + "=" * 60)
        print("既存のoutputディレクトリが見つかりました")
        print(f"パス: {OUTPUT_DIR}")
        print("=" * 60)

        while True:
            choice = input("\n削除しますか？ (y/n): ").lower().strip()
            if choice == "y" or choice == "yes":
                try:
                    shutil.rmtree(OUTPUT_DIR)
                    print(f"✓ {OUTPUT_DIR} を削除しました")
                    # ディレクトリ削除後はログファイルがないのでprintのみ
                    return True
                except Exception as e:
                    print(f"✗ エラー: {e}")
                    # エラー時はログファイルがまだ存在するので記録可能
                    try:
                        log_message(f"outputディレクトリの削除に失敗: {e}")
                    except Exception:
                        pass  # ログ記録に失敗してもスクリプトは続行
                    return False
            elif choice == "n" or choice == "no":
                print("✓ 既存のディレクトリを保持します")
                log_message("既存のoutputディレクトリを保持")
                return False
            else:
                print("無効な入力です。y または n を入力してください。")
        return False


def process_book():
    """1冊の本を処理（カメラからISBNを取得）"""
    # バーコードを読み取る
    isbn = read_barcode_from_camera()
    if not isbn:
        log_message("ISBNの取得に失敗しました")
        return False

    return process_single_book(isbn)


def main():
    """メイン処理"""
    print("=" * 60)
    print("本のバーコードスキャナー (Google & 楽天API統合版)")
    print("=" * 60)

    # outputディレクトリを削除するか確認
    clear_output_directory()

    # ディレクトリをセットアップ
    setup_directories()

    log_message("スクリプトを開始しました")

    while True:
        print("\n1: 連続スキャンモード（カメラ起動のまま）")
        print("2: 単発スキャンモード（1冊ずつ）")
        print("3: 終了")
        choice = input("選択してください: ")

        if choice == "1":
            continuous_barcode_scan(process_single_book)
        elif choice == "2":
            process_book()
        elif choice == "3":
            log_message("スクリプトを終了しました")
            break
        else:
            print("無効な選択です")

    print("\n処理が完了しました。")
    print(f"出力先: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
