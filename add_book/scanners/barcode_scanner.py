"""バーコードスキャン機能"""

import cv2
import numpy as np
from pyzbar.pyzbar import decode
from utils.logger import log_message


def continuous_barcode_scan(process_callback):
    """カメラを起動したまま連続してバーコードを読み取る

    Args:
        process_callback: ISBNを処理するコールバック関数
    """
    log_message("カメラを起動しています...")
    cap = cv2.VideoCapture(1)

    if not cap.isOpened():
        log_message("エラー: カメラを開けませんでした")
        return

    log_message("バーコードをカメラにかざしてください (ESCキーで終了)")
    log_message("ISBN検出後、自動的に処理を開始します")

    last_isbn = None
    processing = False

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                log_message("エラー: フレームの取得に失敗しました")
                break

            # 処理中でない場合のみバーコードをスキャン
            if not processing:
                # バーコードをデコード
                decoded_objects = decode(frame)

                for obj in decoded_objects:
                    barcode_data = obj.data.decode("utf-8")
                    barcode_type = obj.type

                    # バーコードが検出されたら枠を描画
                    points = obj.polygon
                    if len(points) == 4:
                        pts = np.array(
                            [(point.x, point.y) for point in points], dtype=np.int32
                        )
                        cv2.polylines(
                            frame,
                            [pts],
                            True,
                            (0, 255, 0),
                            3,
                        )

                    # ISBNかどうか判定（ISBN-13またはISBN-10）
                    if barcode_type == "EAN13" and barcode_data.startswith("978"):
                        # 同じISBNを連続で読み取らないようにする
                        if barcode_data != last_isbn:
                            log_message(f"ISBNを検出しました: {barcode_data}")
                            last_isbn = barcode_data
                            processing = True

                            # ISBNを処理
                            process_callback(barcode_data)

                            processing = False
                            log_message(
                                "次のバーコードをかざしてください (ESCキーで終了)"
                            )

                    elif barcode_type == "EAN13":
                        log_message(f"ISBN以外のバーコードです: {barcode_data}")

            # 処理中の表示
            if processing:
                cv2.putText(
                    frame,
                    "Processing...",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 0, 255),
                    2,
                )

            # フレームを表示
            cv2.imshow("Barcode Scanner (ESC to quit)", frame)

            # ESCキーで終了
            if cv2.waitKey(1) & 0xFF == 27:
                log_message("スキャンを終了します")
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()


def read_barcode_from_camera():
    """カメラからバーコードを読み取る（単発モード）"""
    log_message("カメラを起動しています...")
    cap = cv2.VideoCapture(1)

    if not cap.isOpened():
        log_message("エラー: カメラを開けませんでした")
        return None

    log_message("バーコードをカメラにかざしてください (ESCキーで終了)")

    while True:
        ret, frame = cap.read()
        if not ret:
            log_message("エラー: フレームの取得に失敗しました")
            break

        # バーコードをデコード
        decoded_objects = decode(frame)

        for obj in decoded_objects:
            barcode_data = obj.data.decode("utf-8")
            barcode_type = obj.type

            # バーコードが検出されたら枠を描画
            points = obj.polygon
            if len(points) == 4:
                pts = np.array([(point.x, point.y) for point in points], dtype=np.int32)
                cv2.polylines(frame, [pts], True, (0, 255, 0), 3)

            # ISBNかどうか判定（ISBN-13またはISBN-10）
            if barcode_type == "EAN13" and barcode_data.startswith("978"):
                log_message(f"ISBNを検出しました: {barcode_data}")
                cap.release()
                cv2.destroyAllWindows()
                return barcode_data
            elif barcode_type == "EAN13":
                log_message(f"ISBN以外のバーコードです: {barcode_data}")

        # フレームを表示
        cv2.imshow("Barcode Scanner", frame)

        # ESCキーで終了
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()
    return None
